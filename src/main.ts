import { EC2Client, Instance, paginateDescribeInstances } from '@aws-sdk/client-ec2'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'

const PARAMETER_NAME = '/tag-sync/tags'

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



export async function main() {
    const ssmClient = new SSMClient( { region: 'us-east-1' } )
    const tagParams = await getTagsFromSssm( ssmClient )
    console.log( tagParams )

    const ec2Client = new EC2Client( { region: 'us-east-1' } )
    const instances = await listEc2Instances( ec2Client )

    for ( const instance of instances ) {
        console.log( `Instance ID: ${instance.InstanceId}` )
        console.log( `Instance Type: ${instance.InstanceType}` )
        console.log( 'Volumes:' )
        console.dir( instance.BlockDeviceMappings, { depth: null } )

        console.log( 'Tags:' )
        console.dir( instance.Tags, { depth: null } )
        console.log( '---' )
    }

}




main().then( () => {
    console.log( 'Done' )
} )