import { CreateTagsCommand, EC2Client, Instance, paginateDescribeInstances, paginateDescribeVolumes, Tag, Volume } from '@aws-sdk/client-ec2'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'

const PARAMETER_NAME = '/tag-sync/tags'
const OVERWRITE_TAGS_ON_VOLUME = true
const DRY_RUN = true

// Retrieves a JSON blog from SSM Parameter Store and
// returns it as a TagParams object.
export async function getTagsFromSssm( ssmClient: SSMClient ): Promise<Map<string, string>> {
    const command = new GetParameterCommand( {
        Name: PARAMETER_NAME,
    } )

    const response = await ssmClient.send( command )

    if ( !response.Parameter || !response.Parameter.Value ) {
        throw new Error( `Parameter ${PARAMETER_NAME} not found or has no value` )
    }

    const tags: Map<string, string> = JSON.parse( response.Parameter.Value )

    return tags
}

export async function listEc2Instances( ec2Client: EC2Client ): Promise<Instance[]> {
    const paginator = paginateDescribeInstances( { client: ec2Client }, {} )
    const instances: Instance[] = []
    for await ( const page of paginator ) {
        const reservations = page.Reservations!

        for ( const reservation of reservations ) {
            instances.push( ...reservation.Instances! )
        }
    }

    return instances

}

// Lists all EC2 volumes in the account and returns them as a Map with the Volume ID as the key
export async function listVolumes( ec2Client: EC2Client ): Promise<Map<string, Volume>> {
    const paginator = paginateDescribeVolumes( { client: ec2Client }, {} )

    const volumeMap = new Map<string, Volume>()

    for await ( const page of paginator ) {
        const volumeList = page.Volumes!

        for ( const volume of volumeList ) {
            volumeMap.set( volume.VolumeId!, volume )
        }
    }
    return volumeMap
}



export async function applyInstanceTagsToVolumes( ec2Client: EC2Client, instance: Instance, volumes: Map<string, Volume> ) {
    if ( !instance.Tags ) {
        console.log( `Instance ${instance.InstanceId} has no tags, skipping` )
        return
    }

    for ( const mapping of instance.BlockDeviceMappings || [] ) {
        console.log( `Checking mapping: ${JSON.stringify( mapping )}` )

        const volumeId = mapping.Ebs!.VolumeId!
        const volume = volumes.get( volumeId )

        // It should be impossible to run into this, but just in case
        if ( !volume ) {
            console.warn( `Volume ${volumeId} not found for instance ${instance.InstanceId}` )
            continue
        }

        let tagsToApply: Tag[] = []

        for ( const tag of instance.Tags ) {

            // Skip the "Name" tag, which is not needed
            if ( tag.Key === 'Name' ) {
                console.log( `Skipping tag ${tag.Key} on volume ${volumeId} from instance ${instance.InstanceId}` )
                continue
            }


            console.log( `Checking tag ${tag.Key} on volume ${volumeId} from instance ${instance.InstanceId}` )

            const volumeTag = volume.Tags?.find( vTag => vTag.Key === tag.Key )

            if ( !volumeTag ) {
                // If the tag is not on the volume, we add it to the tags to apply
                tagsToApply.push( {
                    Key: tag.Key,
                    Value: tag.Value,
                } )
            } else if ( OVERWRITE_TAGS_ON_VOLUME && volumeTag.Value !== tag.Value ) {
                // If the tag is on the volume but has a different value, we overwrite it
                console.log( `Overwriting tag ${tag.Key} on volume ${volumeId} from instance ${instance.InstanceId}` )
                tagsToApply.push( {
                    Key: tag.Key,
                    Value: tag.Value,
                } )
            } else if ( !OVERWRITE_TAGS_ON_VOLUME && volumeTag.Value !== tag.Value ) {
                // If the tag is different and we are not overwriting, we skip it
                console.log( `Skipping tag ${tag.Key} on volume ${volumeId} from instance ${instance.InstanceId} because it already exists with a different value and overwrite is false` )
            }

        }

        if ( tagsToApply.length > 0 ) {

            console.log( `Applying tags to volume ${volumeId} from instance ${instance.InstanceId}` )

            if ( DRY_RUN ) {
                console.log( `DRY RUN: Would apply tags: ${JSON.stringify( tagsToApply )}` )
                continue
            }

            const command = new CreateTagsCommand( {
                Resources: [ volumeId ],
                Tags: tagsToApply,
            } )

            await ec2Client.send( command )
            console.log( `Tags applied to volume ${volumeId}` )
        }

    }
}



export async function main() {
    const ssmClient = new SSMClient( { region: 'us-east-1' } )
    const defaultTags = await getTagsFromSssm( ssmClient )
    console.log( defaultTags )

    const ec2Client = new EC2Client( { region: 'us-east-1' } )
    const instances = await listEc2Instances( ec2Client )

    // for ( const instance of instances ) {
    //     console.log( `Instance ID: ${instance.InstanceId}` )
    //     console.log( `Instance Type: ${instance.InstanceType}` )
    //     console.log( 'Volumes:' )
    //     console.dir( instance.BlockDeviceMappings, { depth: null } )

    //     console.log( 'Tags:' )
    //     console.dir( instance.Tags, { depth: null } )
    //     console.log( '---' )
    // }

    const volumes = await listVolumes( ec2Client )
    // for ( const volume of volumes ) {
    //     console.log( `Volume ID: ${volume[ 1 ].VolumeId}` )
    //     console.log( `Size: ${volume[ 1 ].Size} GiB` )
    //     console.log( 'Tags:' )
    //     console.dir( volume[ 1 ].Tags, { depth: null } )
    //     console.log( '---' )
    // }


    for ( const instance of instances ) {
        console.log( `Processing instance ${instance.InstanceId}` )
        await applyInstanceTagsToVolumes( ec2Client, instance, volumes )
    }
}




main().then( () => {
    console.log( 'Done' )
} )